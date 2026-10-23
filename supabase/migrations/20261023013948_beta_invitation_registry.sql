-- Additive registry; existing family grants keep their meaning and default plan.
alter table public.complimentary_access_grants add column if not exists plan_key text not null default 'core' check(plan_key in ('core','byo'));
alter table public.complimentary_access_grants drop constraint complimentary_access_grants_access_type_check;
alter table public.complimentary_access_grants add constraint complimentary_access_grants_access_type_check check(access_type in ('family','beta'));
create table app_private.beta_invitations(email text primary key check(email=lower(trim(email))),plan_key text not null default 'core' check(plan_key in ('core','byo')),active boolean not null default true,created_at timestamptz not null default now());
create table app_private.beta_sponsor_settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false,daily_global_requests integer not null default 50 check(daily_global_requests between 1 and 10000),daily_user_requests integer not null default 20 check(daily_user_requests between 1 and 1000),total_requests integer not null default 200 check(total_requests between 1 and 100000));
insert into app_private.beta_sponsor_settings(singleton) values(true);
create table app_private.beta_sponsor_requests(id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade,provider text not null check(provider in ('anthropic','gemini')),created_at timestamptz not null default now());
create index beta_requests_user_date on app_private.beta_sponsor_requests(user_id,created_at);
alter table app_private.beta_invitations enable row level security;
alter table app_private.beta_sponsor_settings enable row level security;
alter table app_private.beta_sponsor_requests enable row level security;
revoke all on app_private.beta_invitations,app_private.beta_sponsor_settings,app_private.beta_sponsor_requests from public,anon,authenticated;
grant all on app_private.beta_invitations,app_private.beta_sponsor_settings,app_private.beta_sponsor_requests to service_role;
grant usage,select on sequence app_private.beta_sponsor_requests_id_seq to service_role;
create function public.beta_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('plan',i.plan_key,'complimentary',true) from app_private.beta_invitations i join auth.users u on lower(u.email)=i.email where u.id=(select auth.uid()) and u.email_confirmed_at is not null and i.active;
$$;
revoke all on function public.beta_access() from public,anon;
grant execute on function public.beta_access() to authenticated;
create function public.beta_access_for_user(target_user_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('plan',i.plan_key,'complimentary',true) from app_private.beta_invitations i join auth.users u on lower(u.email)=i.email where u.id=target_user_id and u.email_confirmed_at is not null and i.active;
$$;
revoke all on function public.beta_access_for_user(uuid) from public,anon,authenticated;
grant execute on function public.beta_access_for_user(uuid) to service_role;
create function public.reserve_beta_sponsored_request(requested_user_id uuid,requested_provider text) returns boolean language plpgsql security invoker set search_path='' as $$
declare settings app_private.beta_sponsor_settings; day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 if requested_provider not in ('anthropic','gemini') then return false; end if;
 perform 1 from app_private.beta_invitations i join auth.users u on lower(u.email)=i.email where u.id=requested_user_id and u.email_confirmed_at is not null and i.active for share of i;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(197023,3000);
 select * into settings from app_private.beta_sponsor_settings where singleton;
 if not settings.enabled then return false; end if;
 if (select count(*) from app_private.beta_sponsor_requests)>=settings.total_requests or (select count(*) from app_private.beta_sponsor_requests where created_at>=day_start)>=settings.daily_global_requests or (select count(*) from app_private.beta_sponsor_requests where user_id=requested_user_id and created_at>=day_start)>=settings.daily_user_requests then return false; end if;
 insert into app_private.beta_sponsor_requests(user_id,provider) values(requested_user_id,requested_provider);
 return true;
end $$;
revoke all on function public.reserve_beta_sponsored_request(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_beta_sponsored_request(uuid,text) to service_role;
