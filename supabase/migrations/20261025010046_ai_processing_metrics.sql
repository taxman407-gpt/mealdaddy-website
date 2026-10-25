create table public.ai_processing_calls (
 id uuid primary key,
 user_id uuid references auth.users(id) on delete set null,
 reservation_id uuid not null,
 ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
 created_at timestamptz not null default now(),
 environment text not null check(environment in ('beta','production')),
 category text not null, operation text not null,
 provider text not null, model text not null,
 funding text not null check(funding in ('hosted','sponsor','personal')),
 status text not null check(status in ('pending','processed','rejected','unknown')),
 photos_submitted integer not null default 0 check(photos_submitted>=0),
 photos_processed integer not null default 0 check(photos_processed>=0),
 input_tokens bigint, output_tokens bigint, search_calls integer not null default 0,
 estimated_cost_micros bigint check(estimated_cost_micros>=0), rate_version text, http_status integer
);
alter table public.ai_processing_calls enable row level security;
revoke all on public.ai_processing_calls from public,anon,authenticated;
grant select,insert,update on public.ai_processing_calls to service_role;
create index ai_processing_calls_created_idx on public.ai_processing_calls(created_at);
create index ai_processing_calls_user_idx on public.ai_processing_calls(user_id);
create index ai_processing_calls_entry_idx on public.ai_processing_calls(ledger_entry_id);
create table public.ai_processing_tracking (
 id boolean primary key default true check(id), started_at timestamptz not null default now()
);
insert into public.ai_processing_tracking(id) values(true);
alter table public.ai_processing_tracking enable row level security;
revoke all on public.ai_processing_tracking from public,anon,authenticated;
grant select on public.ai_processing_tracking to service_role;
create function public.owner_ai_processing_report(requested_from timestamptz,requested_to timestamptz)
returns jsonb language sql stable security invoker set search_path=public as $$
 with bounds as (select greatest(requested_from,started_at) as start_at,requested_to as end_at,started_at from public.ai_processing_tracking),
 calls as (select c.* from public.ai_processing_calls c,bounds b where c.created_at>=b.start_at and c.created_at<b.end_at),
 meals as (select count(*) n from public.ledger_entries l,bounds b where l.kind='meal' and l.created_at>=b.start_at and l.created_at<b.end_at),
 groups as (select environment,category,funding,count(*) provider_calls,count(distinct reservation_id) requests,
 count(distinct reservation_id) filter(where status='processed') processed_requests,
 sum(photos_processed) photos_processed,sum(photos_submitted) photos_submitted,sum(search_calls) search_calls,
 count(*) filter(where status in ('unknown','pending')) unresolved_calls,
 count(*) filter(where status='rejected') rejected_calls,
 count(*) filter(where estimated_cost_micros is null) unpriced_calls,
 sum(estimated_cost_micros)/1000000.0 known_estimated_cost_usd
 from calls group by environment,category,funding)
 select jsonb_build_object('tracking_started_at',b.started_at,'effective_from',b.start_at,'to',b.end_at,'meal_entries',m.n,
 'rows',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object(
 'photos_per_meal',g.photos_processed::numeric/nullif(m.n,0),
 'requests_per_meal',g.processed_requests::numeric/nullif(m.n,0),
 'estimated_cost_per_meal',case when g.unpriced_calls=0 then g.known_estimated_cost_usd/nullif(m.n,0) end,
 'estimated_cost_per_request',case when g.unpriced_calls=0 then g.known_estimated_cost_usd/nullif(g.requests,0) end,
 'allocated_cost_per_photo',case when g.unpriced_calls=0 then g.known_estimated_cost_usd/nullif(g.photos_processed,0) end
 ) order by environment,category,funding) from groups g),'[]'::jsonb)) from bounds b cross join meals m;
$$;
revoke all on function public.owner_ai_processing_report(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.owner_ai_processing_report(timestamptz,timestamptz) to service_role;
